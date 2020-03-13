//use std::collections::HashMap;
use serde::{Serialize, Serializer};

struct X;

impl Serialize for X {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str("Hello, world!")
    }
}
//
//fn main() {
//  println!("{}", serde_json::to_string(&X).unwrap());
//}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("{}", serde_json::to_string(&X).unwrap());
    Ok(())
}
