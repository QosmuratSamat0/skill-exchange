package usecase

import (
	"strings"

	"github.com/QosmuratSamat0/pairexx/matchmaking-service/internal/domain"
)

// normSkill lowercases and trims a skill string for consistent comparison.
func normSkill(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

// skillPartialMatch reports whether two skill strings refer to the same concept.
// "Go" matches "Golang", "go", "GO", "Go Language", etc.
// The rule: one normalised string is a substring of the other.
func skillPartialMatch(a, b string) bool {
	an, bn := normSkill(a), normSkill(b)
	if an == "" || bn == "" {
		return false
	}
	return an == bn || strings.Contains(an, bn) || strings.Contains(bn, an)
}

// countOverlap counts how many skills from 'needs' are partially matched by at
// least one skill in 'supply'.
func countOverlap(needs, supply []string) int {
	n := 0
	for _, need := range needs {
		for _, s := range supply {
			if skillPartialMatch(need, s) {
				n++
				break
			}
		}
	}
	return n
}

// CalculateMatchScore returns a 0–100 score describing how well two profiles can
// exchange skills.
//
// Tier thresholds (also used client-side for badge logic):
//
//	Primary   (perfect exchange, both directions): 70–100
//	Secondary (they can teach me, not vice-versa):  40–65
//	Tertiary  (I can teach them, not vice-versa):   10–35
func CalculateMatchScore(me, other *domain.Profile) int {
	if me.UserID == other.UserID {
		return 0
	}

	// How much they can teach me  (their IHave ∩ my IWant)
	teachMe := countOverlap(me.IWant, other.IHave)
	// How much I can teach them   (my IHave  ∩ their IWant)
	teachThem := countOverlap(other.IWant, me.IHave)

	switch {
	case teachMe > 0 && teachThem > 0:
		// Primary — perfect exchange
		score := 70 + teachMe*5 + teachThem*5
		if score > 100 {
			score = 100
		}
		return score

	case teachMe > 0:
		// Secondary — supply focus (they teach me)
		score := 40 + teachMe*5
		if score > 65 {
			score = 65
		}
		return score

	case teachThem > 0:
		// Tertiary — demand focus (I teach them)
		score := 10 + teachThem*5
		if score > 35 {
			score = 35
		}
		return score

	default:
		return 0
	}
}
