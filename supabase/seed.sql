-- Seed initial flagship series with zeroed metrics ready for telemetry sync
INSERT INTO series (tmdb_id, slug, title, network, genre_group, release_years, chart_color, wiki_slug, reddit_query, viewers_premiere_28d, viewers_finale, delta_pct)
VALUES
  (66732, 'stranger-things', 'Stranger Things', 'Netflix', 'Drama & Sci-Fi', '2024–2025', '#C66A3D', 'Stranger_Things', '"Stranger Things" (Netflix OR episode OR season)', 0, 0, 0.0),
  (119051, 'wednesday', 'Wednesday', 'Netflix', 'Drama & Sci-Fi', '2024–2025', '#5C828C', 'Wednesday_(TV_series)', '"Wednesday" (Netflix OR Jenna Ortega OR season)', 0, 0, 0.0),
  (94997, 'house-of-the-dragon', 'House of the Dragon', 'HBO', 'Drama & Sci-Fi', '2024–2025', '#C59A44', 'House_of_the_Dragon', '"House of the Dragon" (HBO OR episode OR season)', 0, 0, 0.0),
  (95396, 'severance', 'Severance', 'Apple TV+', 'Drama & Sci-Fi', '2024–2025', '#C66A3D', 'Severance_(TV_series)', '"Severance" (Apple OR Lumon OR episode)', 0, 0, 0.0),
  (100088, 'the-last-of-us', 'The Last of Us', 'HBO', 'Drama & Sci-Fi', '2024–2025', '#886F99', 'The_Last_of_Us_(TV_series)', '"The Last of Us" (HBO OR Joel OR Ellie)', 0, 0, 0.0),
  (136315, 'the-bear', 'The Bear', 'FX / Hulu', 'Comedy & Drama', '2024–2025', '#5C828C', 'The_Bear_(TV_series)', '"The Bear" (Hulu OR FX OR Carmy)', 0, 0, 0.0),
  (91239, 'bridgerton', 'Bridgerton', 'Netflix', 'Drama', '2024–2025', '#6E8761', 'Bridgerton', '"Bridgerton" (Netflix OR season OR episode)', 0, 0, 0.0),
  (111803, 'the-white-lotus', 'The White Lotus', 'HBO', 'Drama', '2024–2025', '#A65D67', 'The_White_Lotus', '"The White Lotus" (HBO OR episode OR finale)', 0, 0, 0.0),
  (76479, 'the-boys', 'The Boys', 'Prime Video', 'Drama & Sci-Fi', '2024–2025', '#C59A44', 'The_Boys_(TV_series)', '"The Boys" (Prime OR Homelander OR episode)', 0, 0, 0.0),
  (106379, 'fallout', 'Fallout', 'Prime Video', 'Drama & Sci-Fi', '2024–2025', '#6E8761', 'Fallout_(American_TV_series)', '"Fallout" (Prime OR Vault OR episode)', 0, 0, 0.0),
  (76331, 'succession', 'Succession', 'HBO', 'Drama', '2023–2024', '#886F99', 'Succession_(TV_series)', '"Succession" (HBO OR Kendall OR Roy)', 0, 0, 0.0),
  (125988, 'silo', 'Silo', 'Apple TV+', 'Drama & Sci-Fi', '2024–2025', '#5C828C', 'Silo_(TV_series)', '"Silo" (Apple OR Juliette OR episode)', 0, 0, 0.0)
ON CONFLICT (tmdb_id) DO NOTHING;
