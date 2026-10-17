use std::time::Duration;

pub fn create_http_client() -> ureq::Agent {
    ureq::builder()
        .timeout_connect(Duration::from_secs(10))
        .timeout_read(Duration::from_secs(15))
        .timeout_write(Duration::from_secs(10))
        .build()
}
