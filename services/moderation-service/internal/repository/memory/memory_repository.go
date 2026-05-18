package memory

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/QosmuratSamat0/pairexx/moderation-service/internal/domain"
)

type MemoryReportRepository struct {
	mu      sync.RWMutex
	reports map[string]*domain.Report
	order   []*domain.Report
}

func New() *MemoryReportRepository {
	return &MemoryReportRepository{
		reports: make(map[string]*domain.Report),
	}
}

func (r *MemoryReportRepository) CreateReport(ctx context.Context, rep *domain.Report) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.reports[rep.ID] = rep
	r.order = append(r.order, rep)
	return nil
}

func (r *MemoryReportRepository) GetReport(ctx context.Context, id string) (*domain.Report, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	rep, ok := r.reports[id]
	if !ok {
		return nil, errors.New("report not found")
	}
	return rep, nil
}

func (r *MemoryReportRepository) ListReports(ctx context.Context, limit int) ([]*domain.Report, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if limit <= 0 || limit > len(r.order) {
		limit = len(r.order)
	}
	// newest first
	out := make([]*domain.Report, 0, limit)
	for i := len(r.order) - 1; i >= 0 && len(out) < limit; i-- {
		out = append(out, r.order[i])
	}
	return out, nil
}

func (r *MemoryReportRepository) CountReports(ctx context.Context, reportedUserID string, now time.Time) (domain.ReportCounts, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var c domain.ReportCounts
	for _, rep := range r.order {
		if rep.ReportedUserID != reportedUserID {
			continue
		}
		c.Total++
		if rep.CreatedAt.After(now.Add(-24 * time.Hour)) {
			c.Last24h++
		}
		if rep.CreatedAt.After(now.Add(-7 * 24 * time.Hour)) {
			c.Last7d++
		}
	}
	return c, nil
}

