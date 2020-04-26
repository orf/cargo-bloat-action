fn main() {
  let resp = ureq::get("http://www.rust-lang.org").call();
  println!("{:?}", resp.into_string());
}
