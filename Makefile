GO ?= $(shell which /opt/homebrew/opt/go@1.24/bin/go 2>/dev/null || which go1.24 2>/dev/null || which go)

.PHONY: all build build-intel build-local package deploy test harness clean

all: package

# 검증 하네스(Test & Verification Harness) 가동
test: harness
harness:
	@chmod +x harness/*.sh
	@bash harness/run.sh

# 배포 패키지 (.tar.gz) 원클릭 생성
package:
	@chmod +x deploy/*.sh deploy/templates/*.sh
	@bash deploy/package.sh

# 원격 맥 미니로 자동 배포 (예: make deploy TARGET=user@192.168.1.100)
deploy:
	@chmod +x deploy/*.sh deploy/templates/*.sh
	@bash deploy/remote-deploy.sh $(TARGET)

# 2011 Mac mini (Intel x86_64) 단일 바이너리 빌드
build-intel:
	@echo "📦 1/2: 프론트엔드 빌드 중..."
	cd frontend && npm run build
	@echo "🚀 2/2: 2011 인텔 맥(darwin/amd64) 단일 바이너리 컴파일 중..."
	cd backend && GOTOOLCHAIN=local CGO_ENABLED=0 MACOSX_DEPLOYMENT_TARGET=10.13 GOOS=darwin GOARCH=amd64 $(GO) build -ldflags="-s -w" -o ../mininas-intel-mac .
	@echo "✅ 빌드 완료: ./mininas-intel-mac (단일 파일)"
	@ls -lh ./mininas-intel-mac

# 로컬(개발 머신) 실행용 바이너리 빌드
build-local:
	@echo "📦 1/2: 프론트엔드 빌드 중..."
	cd frontend && npm run build
	@echo "🚀 2/2: 로컬 바이너리 컴파일 중..."
	cd backend && GOTOOLCHAIN=local go build -ldflags="-s -w" -o ../mininas-local .
	@echo "✅ 빌드 완료: ./mininas-local"
	@ls -lh ./mininas-local

clean:
	rm -rf mininas-intel-mac mininas-local backend/dist backend/mininas-* release/
