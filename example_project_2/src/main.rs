fn main() {
  let resp = ureq::get("https://www.rust-lang.org").call();
  println!("{:?}", resp.into_string());
}
