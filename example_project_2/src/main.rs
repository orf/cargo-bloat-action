use ureq::json;

fn main() {
  // println!("{}", serde_json::to_string(&X).unwrap());
  let resp = ureq::post("http://my-server.com/ingest")
    .set("Transfer-Encoding", "chunked")
    .send_json(json!({
            "name": "martin",
            "rust": true
        }));

  println!("{:?}", resp.into_json());
}
