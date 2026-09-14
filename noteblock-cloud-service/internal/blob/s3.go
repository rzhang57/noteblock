package blob

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

type S3 struct {
	client *s3.Client
	bucket string
}

// Supabase Storage speaks the S3 API, so pointing BLOB_S3_ENDPOINT at its /storage/v1/s3 url
// with the project's access keys needs no other change. Path style is required there.
func NewS3(ctx context.Context) (*S3, error) {
	bucket := os.Getenv("BLOB_S3_BUCKET")
	if bucket == "" {
		return nil, errors.New("BLOB_S3_BUCKET is not set")
	}

	region := os.Getenv("BLOB_S3_REGION")
	if region == "" {
		region = "us-east-1"
	}

	opts := []func(*config.LoadOptions) error{config.WithRegion(region)}
	if key, secret := os.Getenv("BLOB_S3_ACCESS_KEY_ID"), os.Getenv("BLOB_S3_SECRET_ACCESS_KEY"); key != "" && secret != "" {
		opts = append(opts, config.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(key, secret, ""),
		))
	}

	cfg, err := config.LoadDefaultConfig(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		if endpoint := os.Getenv("BLOB_S3_ENDPOINT"); endpoint != "" {
			o.BaseEndpoint = aws.String(endpoint)
			o.UsePathStyle = true
		}
	})

	return &S3{client: client, bucket: bucket}, nil
}

func (s *S3) Put(ctx context.Context, key string, r io.Reader, contentType string) error {
	input := &s3.PutObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key), Body: r}
	if contentType != "" {
		input.ContentType = aws.String(contentType)
	}

	_, err := s.client.PutObject(ctx, input)

	return err
}

func (s *S3) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
	if err != nil {
		var missing *types.NoSuchKey
		if errors.As(err, &missing) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	return out.Body, nil
}

func (s *S3) Exists(ctx context.Context, key string) (bool, error) {
	_, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
	if err == nil {
		return true, nil
	}

	var missing *types.NotFound
	if errors.As(err, &missing) {
		return false, nil
	}

	return false, err
}
