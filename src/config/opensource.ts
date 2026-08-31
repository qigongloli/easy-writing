// 开源版对外链接的唯一出处。仓库正式建好后只改 GITHUB_REPO_URL 这一行。
const GITHUB_REPO_URL = 'https://github.com/yilujian/easy-writing'

export const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues`

export const GITHUB_NEW_ISSUE_URL = `${GITHUB_REPO_URL}/issues/new`

export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`

/** GitHub 公开 API：最新 Release（轻量更新提醒用，无需任何鉴权） */
export const GITHUB_LATEST_RELEASE_API_URL = `${GITHUB_REPO_URL.replace(
  'https://github.com/',
  'https://api.github.com/repos/'
)}/releases/latest`
