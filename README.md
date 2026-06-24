# 개미레터

Markdown으로 작성된 조사/정리/분석 글을 웹에서 읽기 좋게 보여주는 정적 페이지입니다.

- 본문 소스: `src/letters/*.md`
- 스타일: `src/assets/style.css`
- 빌드: `npm run build`
- 출력: `docs/`

## 공개수준

각 레터 frontmatter의 `visibility` 값으로 표시합니다.

- `public`: 공개 가능
- `link-only`: 링크 공유용
- `protected`: 약한 보호/주의 필요
- `private`: 빌드 제외
