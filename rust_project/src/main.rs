//use std::collections::HashMap;
// use serde::{Serialize, Serializer};
//
// struct X;
//
// impl Serialize for X {
//   fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
//     serializer.serialize_str("Hello, world!")
//   }
// }
//
//fn main() {
//  println!("{}", serde_json::to_string(&X).unwrap());
//}

use std::collections::HashMap;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
  let client = reqwest::Client::new();
  let mut map = HashMap::new();
  map.insert("lang", "rust");
  map.insert("body", "json");
  let body = client.post("https://www.rust-lang.org")
    .json(&map)
    .send()
    .await.expect("error fetching");

  println!("{:?}", body);
  Ok(())
}
