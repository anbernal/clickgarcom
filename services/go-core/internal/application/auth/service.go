package auth

import (
	"errors"
	"time"

	"github.com/anbernal/clickgarcom/internal/domain/user"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type Service struct {
	repo      user.Repository
	jwtSecret []byte
	tokenTTL  time.Duration
}

type Claims struct {
	UserID     string `json:"sub"`
	TenantID   string `json:"tenant_id"`
	Role       string `json:"role"`
	Email      string `json:"email,omitempty"`
	TenantName string `json:"tenant_name,omitempty"`
	jwt.RegisteredClaims
}

func NewService(repo user.Repository, secret string, ttl time.Duration) *Service {
	return &Service{repo: repo, jwtSecret: []byte(secret), tokenTTL: ttl}
}

func (s *Service) Register(tenantID uuid.UUID, email, password string, role user.Role) (*user.User, error) {
	// check existing
	if _, err := s.repo.FindByEmail(email); err == nil {
		return nil, errors.New("email already registered")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	u := &user.User{ID: uuid.New(), TenantID: tenantID, Email: email, PasswordHash: string(hash), Role: role}
	if err := s.repo.Create(u); err != nil {
		return nil, err
	}
	return u, nil
}

func (s *Service) Login(email, password string) (string, error) {
	u, err := s.repo.FindByEmail(email)
	if err != nil {
		return "", errors.New("invalid credentials")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return "", errors.New("invalid credentials")
	}
	// generate JWT
	claims := Claims{UserID: u.ID.String(), TenantID: u.TenantID.String(), Role: string(u.Role), RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.tokenTTL)), IssuedAt: jwt.NewNumericDate(time.Now())}}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(s.jwtSecret)
	if err != nil {
		return "", err
	}
	return signed, nil
}

func (s *Service) ValidateToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		return s.jwtSecret, nil
	})
	if err != nil {
		return nil, err
	}
	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}
	return nil, errors.New("invalid token")
}
