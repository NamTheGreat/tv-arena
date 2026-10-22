pub fn compute_buzz_score(wiki_views: i64, reddit_comments: i64, reddit_upvotes: i64) -> i64 {
    (wiki_views * 10) + (reddit_comments * 150) + (reddit_upvotes * 25)
}

pub fn calculate_delta(current: i64, previous: i64) -> f64 {
    if previous > 0 {
        let raw = (((current - previous) as f64 / previous as f64) * 1000.0).round() / 10.0;
        raw.clamp(-99999.0, 99999.0)
    } else {
        0.0
    }
}

pub fn is_tv_description(desc: &str, extract: &str, slug: &str) -> bool {
    let desc_lower = desc.to_lowercase();
    let extract_lower = extract.to_lowercase();

    if slug.ends_with("_(TV_series)") || slug.ends_with("_(American_TV_series)") {
        return true;
    }

    // Exclude novels, films, or albums unless television is explicitly stated
    let is_non_tv = (desc_lower.contains("novel")
        || desc_lower.contains("book")
        || desc_lower.contains("film")
        || desc_lower.contains("album")
        || desc_lower.contains("video game"))
        && !desc_lower.contains("television")
        && !desc_lower.contains("tv series");

    if is_non_tv {
        return false;
    }

    desc_lower.contains("television")
        || desc_lower.contains("tv series")
        || desc_lower.contains("tv show")
        || desc_lower.contains("sitcom")
        || extract_lower.contains("television series")
        || extract_lower.contains("tv series")
        || extract_lower.contains("television drama series")
        || extract_lower.contains("american television")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_buzz_score() {
        assert_eq!(compute_buzz_score(100, 10, 20), 1000 + 1500 + 500);
        assert_eq!(compute_buzz_score(0, 0, 0), 0);
    }

    #[test]
    fn test_compute_buzz_score_matches_sql_weights() {
        // SQL formula from score_weights (id=1):
        // (wiki_views * 10) + (reddit_comments * 150) + (reddit_upvotes * 25)
        let wiki_weight = 10;
        let comment_weight = 150;
        let upvote_weight = 25;

        let wiki_views = 25_000;
        let reddit_comments = 180;
        let reddit_upvotes = 420;

        let sql_result = (wiki_views * wiki_weight)
            + (reddit_comments * comment_weight)
            + (reddit_upvotes * upvote_weight);

        let rust_result = compute_buzz_score(wiki_views, reddit_comments, reddit_upvotes);
        assert_eq!(rust_result, sql_result);
        assert_eq!(rust_result, 287_500);
    }

    #[test]
    fn test_calculate_delta() {
        assert_eq!(calculate_delta(150, 100), 50.0);
        assert_eq!(calculate_delta(50, 100), -50.0);
        assert_eq!(calculate_delta(100, 100), 0.0);
        assert_eq!(calculate_delta(100, 0), 0.0);
    }

    #[test]
    fn test_is_tv_description() {
        assert!(is_tv_description(
            "American television series",
            "Severance is an American science fiction psychological thriller television series",
            "Severance"
        ));
        assert!(is_tv_description(
            "Television sitcom",
            "The Bear is a comedy drama series",
            "The_Bear"
        ));
        assert!(is_tv_description("", "", "Severance_(TV_series)"));
        // Negative tests
        assert!(!is_tv_description(
            "1998 novel by author",
            "The book was released in 1998",
            "Dark"
        ));
        assert!(!is_tv_description(
            "2015 feature film",
            "A film directed by...",
            "Wednesday"
        ));
    }
}
