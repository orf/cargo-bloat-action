extern crate serde;
extern crate serde_json;

use std::collections::HashMap;
use serde::{Serialize, Serializer};

struct X;

impl Serialize for X {
  fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
    serializer.serialize_str("Hello, world!")
  }
}


#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
  let resp = reqwest::get("https://httpbin.org/ip")
    .await?
    .json::<HashMap<String, String>>()
    .await?;
  println!("{:#?}", resp);
  println!("{}", serde_json::to_string(&X).unwrap());
  Ok(())
}
