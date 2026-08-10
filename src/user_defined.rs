use evalexpr::{
    build_operator_tree, ContextWithMutableFunctions, ContextWithMutableVariables, Function,
    HashMapContext, Node, Value,
};
use std::cell::RefCell;

use crate::parameters::ParameterSet;

#[derive(Clone, Debug)]
pub struct ParsedEquations {
    x_node: Node,
    y_node: Node,
    params: ParameterSet,
}

impl ParsedEquations {
    pub fn new(x_str: &str, y_str: &str, params: ParameterSet) -> Result<Self, String> {
        let x_expr = if x_str.trim().is_empty() { "0" } else { x_str };
        let y_expr = if y_str.trim().is_empty() { "0" } else { y_str };

        let x_expr = preprocess_abs(x_expr);
        let y_expr = preprocess_abs(y_expr);

        let x_node = build_operator_tree(&x_expr).map_err(|e| e.to_string())?;
        let y_node = build_operator_tree(&y_expr).map_err(|e| e.to_string())?;

        Ok(Self {
            x_node,
            y_node,
            params,
        })
    }

    pub fn eval(&self, x: f64, y: f64) -> Result<(f64, f64), String> {
        eval_pair(&self.x_node, &self.y_node, x, y, &self.params)
    }
}

fn preprocess_abs(input: &str) -> String {
    let mut s = input.to_string();
    loop {
        let bytes = s.as_bytes();
        let mut found = false;
        let positions: Vec<usize> = bytes
            .iter()
            .enumerate()
            .filter(|(_, &b)| b == b'|')
            .map(|(i, _)| i)
            .collect();
        let mut best: Option<(usize, usize, usize)> = None; // (start, end, span)
        for pair in positions.windows(2) {
            let start = pair[0];
            let end = pair[1];
            let span = end - start;
            let inner = &s[start + 1..end];
            if !inner.is_empty() && (best.is_none() || span < best.unwrap().2) {
                best = Some((start, end, span));
            }
        }
        if let Some((start, end, _)) = best {
            let inner = &s[start + 1..end];
            s = format!("{}abs({}){}", &s[..start], inner, &s[end + 1..]);
            found = true;
        }
        if !found {
            break;
        }
    }
    s
}

fn create_math_context() -> Result<HashMapContext, String> {
    let mut context = HashMapContext::new();

    macro_rules! register_math {
        ($name:expr, $func:ident) => {
            context
                .set_function(
                    $name.into(),
                    Function::new(|args| {
                        let num = args.as_float()?;
                        Ok(Value::Float(num.$func()))
                    }),
                )
                .map_err(|e| e.to_string())?;
        };
    }

    register_math!("sin", sin);
    register_math!("cos", cos);
    register_math!("tan", tan);
    register_math!("abs", abs);
    register_math!("sqrt", sqrt);
    register_math!("exp", exp);
    register_math!("ln", ln);

    Ok(context)
}

thread_local! {
    static MATH_CONTEXT: RefCell<HashMapContext> = RefCell::new(
        create_math_context().expect("Failed to create math context")
    );
}

fn eval_pair(
    x_node: &Node,
    y_node: &Node,
    x: f64,
    y: f64,
    params: &ParameterSet,
) -> Result<(f64, f64), String> {
    MATH_CONTEXT.with(|ctx_cell| {
        let mut context = ctx_cell.borrow_mut();
        context.clear_variables();
        context.set_value("x".into(), Value::Float(x)).ok();
        context.set_value("y".into(), Value::Float(y)).ok();

        for entry in params.entries() {
            context
                .set_value(entry.name.clone(), Value::Float(entry.value))
                .map_err(|e| e.to_string())?;
        }

        let x_val = x_node
            .eval_with_context(&*context)
            .map_err(|e| e.to_string())?;
        let y_val = y_node
            .eval_with_context(&*context)
            .map_err(|e| e.to_string())?;

        let x_out = match x_val {
            Value::Float(v) => v,
            Value::Int(v) => v as f64,
            _ => return Err("Expression result is not a number".to_string()),
        };
        let y_out = match y_val {
            Value::Float(v) => v,
            Value::Int(v) => v as f64,
            _ => return Err("Expression result is not a number".to_string()),
        };
        Ok((x_out, y_out))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parameters::ParameterEntry;

    #[test]
    fn test_preprocess_abs() {
        assert_eq!(preprocess_abs("|x|"), "abs(x)");
        assert_eq!(preprocess_abs("1 - a * |x| + y"), "1 - a * abs(x) + y");
        assert_eq!(preprocess_abs("||x| - |y||"), "abs(abs(x) - abs(y))");
        assert_eq!(preprocess_abs("no pipes here"), "no pipes here");
    }

    #[test]
    fn test_parsed_equations_with_params() {
        let params = ParameterSet::new(vec![
            ParameterEntry {
                name: "a".to_string(),
                value: 2.0,
            },
            ParameterEntry {
                name: "b".to_string(),
                value: -1.0,
            },
        ])
        .unwrap();

        let eq = ParsedEquations::new("a * x + y", "b * y", params).unwrap();
        let (x_out, y_out) = eq.eval(0.5, -2.0).unwrap();

        assert!((x_out - (2.0 * 0.5 - 2.0)).abs() < 1e-12);
        assert!((y_out - (-1.0 * -2.0)).abs() < 1e-12);
    }
}
