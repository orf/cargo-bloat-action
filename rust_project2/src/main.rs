use futures::executor::block_on;

async fn hello_world() {
  let body = reqwest::get("https://www.rust-lang.org")
    .await.expect("error fetching")
    .text()
    .await;

  println!("{:?}", body);
}

fn main() {
  let future = hello_world(); // Nothing is printed
  block_on(future); // `future` is run and "hello, world!" is printed
}
