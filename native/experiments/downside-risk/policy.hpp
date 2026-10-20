#pragma once
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <vector>

// Experimental root ranking only. Values come from observation-based samples.
namespace mist_risk {
constexpr double lossThreshold = 450; // Ignore losses smaller than roughly a cannon.
constexpr double lossCap = 3600;      // Finite, shared material scale; not mate certainty.
inline double lowerTailLoss(const std::vector<double>& scores) {
    if (scores.empty()) throw std::invalid_argument("empty risk sample");
    std::vector<double> sorted = scores;
    for (double v : sorted) if (!std::isfinite(v)) throw std::invalid_argument("nonfinite risk sample");
    std::sort(sorted.begin(), sorted.end());
    // Fractional mass keeps the worst-quarter definition exact for nonmultiples of 4.
    const double mass = sorted.size() * .25;
    double left = mass, total = 0;
    for (double v : sorted) {
        const double take = std::min(1.0, left);
        total += take * std::max(0.0, -std::clamp(v, -lossCap, lossCap) - lossThreshold);
        left -= take;
        if (left <= 1e-12) break;
    }
    return total / mass;
}
inline double weight(double advantage) {
    // One common weight for every candidate in a completed depth, not per move.
    return .30 + .20 * std::clamp(advantage / 600.0, -1.0, 1.0);
}
template<class Rows> void rank(Rows& rows, bool uncertain) {
    if (rows.empty()) return;
    double advantage = rows.front().baseScore;
    for (const auto& row : rows) advantage = std::max(advantage, row.baseScore);
    const double w = uncertain ? weight(advantage) : 0;
    for (auto& row : rows) {
        row.riskWeight = w;
        row.riskPenalty = w * row.tailLoss;
        row.score = row.baseScore - row.riskPenalty;
    }
}
} // namespace mist_risk
