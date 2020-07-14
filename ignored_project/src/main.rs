fn main() {
  let resp = ureq::get("http://neverssl.com").call();
  println!("{:?}", resp.into_string());
}
