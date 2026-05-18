package grpc

import (
	"context"
	"errors"
	"time"

	pb "github.com/QosmuratSamat0/pairexx/proto/user/v1"
	"github.com/QosmuratSamat0/pairexx/user-service/internal/domain"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type UserHandler struct {
	pb.UnimplementedUserServiceServer
	uc domain.UserUsecase
}

func NewUserHandler(uc domain.UserUsecase) *UserHandler {
	return &UserHandler{uc: uc}
}

func (h *UserHandler) GetUser(ctx context.Context, req *pb.GetUserRequest) (*pb.GetUserResponse, error) {
	user, err := h.uc.GetMe(ctx, req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "user not found: %v", err)
	}
	return &pb.GetUserResponse{
		Id:       user.ID,
		Username: user.Email,
		Gender:   user.Gender,
	}, nil
}

func (h *UserHandler) IsBanned(ctx context.Context, req *pb.IsBannedRequest) (*pb.IsBannedResponse, error) {
	_, banned, err := h.uc.GetBanStatus(ctx, req.UserId)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to check ban status: %v", err)
	}
	return &pb.IsBannedResponse{Banned: banned}, nil
}

// UpdateProfile handles a gRPC request to update a user's profile.
// The current proto exposes gender + interests; this method syncs both
// the basic user record AND the UserProfile via the usecase.
func (h *UserHandler) UpdateProfile(ctx context.Context, req *pb.UpdateProfileRequest) (*pb.UpdateProfileResponse, error) {
	// Sync basic user fields (gender, interests).
	if err := h.uc.UpdateMe(ctx, req.UserId, req.Gender, req.Interests); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update user: %v", err)
	}

	// Fetch existing profile so we don't accidentally wipe name/avatar/bio.
	existing, err := h.uc.GetUserProfile(ctx, req.UserId)
	if err != nil || existing == nil {
		existing = &domain.UserProfile{UserID: req.UserId}
	}

	// Preserve existing profile data; only update what the proto provides.
	existing.UpdatedAt = time.Now()
	if err := h.uc.UpdateProfile(ctx, req.UserId, existing); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update profile: %v", err)
	}

	return &pb.UpdateProfileResponse{Success: true}, nil
}

func (h *UserHandler) Login(ctx context.Context, req *pb.LoginRequest) (*pb.AuthResponse, error) {
	access, refresh, err := h.uc.Login(ctx, req.Email, req.Password)
	if err != nil {
		return nil, status.Errorf(codes.Unauthenticated, "login failed: %v", err)
	}
	return &pb.AuthResponse{AccessToken: access, RefreshToken: refresh}, nil
}

func (h *UserHandler) Register(ctx context.Context, req *pb.RegisterRequest) (*pb.AuthResponse, error) {
	err := h.uc.Register(ctx, req.Email, req.Password)
	if err != nil {
		if errors.Is(err, domain.ErrUserAlreadyExists) {
			return nil, status.Errorf(codes.AlreadyExists, "registration failed: %v", err)
		}
		return nil, status.Errorf(codes.Internal, "registration failed: %v", err)
	}
	// Registration does not auto-login; tokens are empty until the client logs in.
	return &pb.AuthResponse{AccessToken: "", RefreshToken: ""}, nil
}
