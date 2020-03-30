#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
  // println!("{}", serde_json::to_string(&X).unwrap());
  let resp = ureq::post("http://my-server.com/ingest")
    .set("Transfer-Encoding", "chunked")
    .send_string("Hello world");

  println!("{:?}", resp);
  Ok(())
}
