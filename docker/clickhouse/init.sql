CREATE DATABASE IF NOT EXISTS bullbear;

CREATE TABLE IF NOT EXISTS bullbear.features (
    ts                    DateTime64(3, 'UTC'),
    asset                 LowCardinality(String),
    momentum              Float64,
    order_flow_imbalance  Float64,
    depth_imbalance       Float64,
    funding_sentiment     Float64,
    volatility_percentile Float64,
    volume_ratio          Float64,
    direction             Float64,
    conviction            Float64
) ENGINE = MergeTree()
ORDER BY (asset, ts)
TTL ts + INTERVAL 90 DAY;

CREATE TABLE IF NOT EXISTS bullbear.regime_scores (
    ts                    DateTime64(3, 'UTC'),
    asset                 LowCardinality(String),
    score                 Float64,
    label                 LowCardinality(String),
    momentum_component    Float64,
    flow_component        Float64,
    depth_component       Float64,
    funding_component     Float64,
    direction             Float64,
    conviction            Float64,
    vol_confidence        Float64,
    volume_confidence     Float64,
    signal_agreement      Float64
) ENGINE = MergeTree()
ORDER BY (asset, ts)
TTL ts + INTERVAL 90 DAY;
