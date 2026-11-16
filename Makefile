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

# GitHub Releases 배포 (태그 기준 아카이브 .tar.gz 및 릴리즈 노트 업로드)
release-gh: package
	@TAG=$$(git describe --tags --exact-match 2>/dev/null || echo ""); \
	if [ -z "$$TAG" ]; then \
		echo "❌ 현재 커밋에 태그가 없습니다. git tag 후 실행하세요."; \
		exit 1; \
	fi; \
	ARCHIVE="release/mininas-$${TAG}-intel-mac.tar.gz"; \
	if [ ! -f "$$ARCHIVE" ]; then \
		ARCHIVE=$$(ls -t release/*.tar.gz 2>/dev/null | head -n 1); \
	fi; \
	NOTES="docs/RELEASE_NOTES_$${TAG}.md"; \
	echo "🚀 GitHub 릴리즈 업로드: $$TAG ($$ARCHIVE)"; \
	if [ -f "$$NOTES" ]; then \
		gh release create "$$TAG" "$$ARCHIVE" --title "MiniNAS $$TAG" --notes-file "$$NOTES" 2>/dev/null || gh release upload "$$TAG" "$$ARCHIVE" --clobber; \
	else \
		gh release create "$$TAG" "$$ARCHIVE" --title "MiniNAS $$TAG" --generate-notes 2>/dev/null || gh release upload "$$TAG" "$$ARCHIVE" --clobber; \
	fi; \
	echo "✅ GitHub Release 등록 완료: https://github.com/choonsik/mininas/releases/tag/$$TAG"

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
