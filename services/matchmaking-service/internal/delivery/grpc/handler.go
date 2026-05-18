package grpc

import (
	"context"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/QosmuratSamat0/pairexx/matchmaking-service/internal/domain"
	pb "github.com/QosmuratSamat0/pairexx/proto/matchmaking/v1"
)

// ---------------------------------------------------------------------------
// Handler struct
// ---------------------------------------------------------------------------

type MatchmakingHandler struct {
	pb.UnimplementedMatchmakingServiceServer
	usecase domain.MatchUsecase
}

func NewMatchmakingHandler(usecase domain.MatchUsecase) *MatchmakingHandler {
	return &MatchmakingHandler{usecase: usecase}
}

// ---------------------------------------------------------------------------
// Profile RPCs
// ---------------------------------------------------------------------------

// UpdateProfile creates or updates a user's matchmaking profile.
func (h *MatchmakingHandler) UpdateProfile(ctx context.Context, req *pb.UpdateProfileRequest) (*pb.UpdateProfileResponse, error) {
	if req.Profile == nil {
		return nil, status.Error(codes.InvalidArgument, "profile is required")
	}

	p := &domain.Profile{
		UserID: req.Profile.UserId,
		Name:   req.Profile.Name,
		IHave:  req.Profile.IHave,
		IWant:  req.Profile.IWant,
		Bio:    req.Profile.Bio,
	}

	if err := h.usecase.UpdateProfile(ctx, p); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update profile: %v", err)
	}

	return &pb.UpdateProfileResponse{Success: true}, nil
}

// GetCandidates returns a ranked list of matching candidates.
func (h *MatchmakingHandler) GetCandidates(ctx context.Context, req *pb.GetCandidatesRequest) (*pb.GetCandidatesResponse, error) {
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}

	candidates, err := h.usecase.GetCandidates(ctx, req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get candidates: %v", err)
	}

	pbCandidates := make([]*pb.Profile, 0, len(candidates))
	for _, c := range candidates {
		pbCandidates = append(pbCandidates, domainProfileToPB(c))
	}

	return &pb.GetCandidatesResponse{Candidates: pbCandidates}, nil
}

// ---------------------------------------------------------------------------
// Request RPCs
// ---------------------------------------------------------------------------

// SendRequest sends a new skill-exchange request from one user to another.
func (h *MatchmakingHandler) SendRequest(ctx context.Context, req *pb.SendExchangeRequest) (*pb.SendExchangeResponse, error) {
	if req.FromUserId == "" || req.ToUserId == "" {
		return nil, status.Error(codes.InvalidArgument, "from_user_id and to_user_id are required")
	}

	if err := h.usecase.SendRequest(ctx, req.FromUserId, req.ToUserId); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to send request: %v", err)
	}

	return &pb.SendExchangeResponse{RequestId: "sent"}, nil
}

// AcceptRequest accepts a pending exchange request and creates a room.
func (h *MatchmakingHandler) AcceptRequest(ctx context.Context, req *pb.AcceptExchangeRequest) (*pb.AcceptExchangeResponse, error) {
	if req.UserId == "" || req.RequestId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id and request_id are required")
	}

	if err := h.usecase.AcceptRequest(ctx, req.UserId, req.RequestId); err != nil {
		c := codes.Internal
		if isNotFound(err) {
			c = codes.NotFound
		}
		return nil, status.Errorf(c, "failed to accept request: %v", err)
	}

	// The room is created inside AcceptRequest; users are notified via SSE/NATS.
	// We return a stable placeholder because the room ID is not surfaced through
	// the current proto. Callers should use the SSE channel to get the room ID.
	return &pb.AcceptExchangeResponse{RoomId: "created"}, nil
}

// DeclineRequest declines a pending exchange request.
func (h *MatchmakingHandler) DeclineRequest(ctx context.Context, req *pb.DeclineExchangeRequest) (*pb.DeclineExchangeResponse, error) {
	if req.UserId == "" || req.RequestId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id and request_id are required")
	}

	if err := h.usecase.DeclineRequest(ctx, req.UserId, req.RequestId); err != nil {
		c := codes.Internal
		if isNotFound(err) {
			c = codes.NotFound
		}
		return nil, status.Errorf(c, "failed to decline request: %v", err)
	}

	return &pb.DeclineExchangeResponse{Success: true}, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func domainProfileToPB(p *domain.Profile) *pb.Profile {
	if p == nil {
		return nil
	}
	return &pb.Profile{
		UserId: p.UserID,
		Name:   p.Name,
		IHave:  p.IHave,
		IWant:  p.IWant,
		Bio:    p.Bio,
	}
}

func isNotFound(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return contains(msg, "not found")
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsStr(s, substr))
}

func containsStr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
