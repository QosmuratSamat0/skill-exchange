package usecase

import (
	"testing"

	"github.com/QosmuratSamat0/pairexx/matchmaking-service/internal/domain"
)

func TestCalculateMatchScore(t *testing.T) {
	tests := []struct {
		name  string
		me    *domain.Profile
		other *domain.Profile
		want  int
	}{
		{
			name: "Perfect match",
			me: &domain.Profile{
				UserID: "me",
				IHave:  []string{"Go"},
				IWant:  []string{"React"},
			},
			other: &domain.Profile{
				UserID: "other",
				IHave:  []string{"React"},
				IWant:  []string{"Go"},
			},
			want: 100,
		},
		{
			name: "One-way match (they have what I want)",
			me: &domain.Profile{
				UserID: "me",
				IHave:  []string{"Java"},
				IWant:  []string{"React"},
			},
			other: &domain.Profile{
				UserID: "other",
				IHave:  []string{"React"},
				IWant:  []string{"Go"},
			},
			want: 50,
		},
		{
			name: "No match",
			me: &domain.Profile{
				UserID: "me",
				IHave:  []string{"Java"},
				IWant:  []string{"Python"},
			},
			other: &domain.Profile{
				UserID: "other",
				IHave:  []string{"React"},
				IWant:  []string{"Go"},
			},
			want: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := CalculateMatchScore(tt.me, tt.other); got != tt.want {
				t.Errorf("CalculateMatchScore() = %v, want %v", got, tt.want)
			}
		})
	}
}
