import { Component } from 'react'
import { IconWarning } from '../lib/icons'
import styles from './ErrorBoundary.module.css'

/**
 * 描画中の例外でアプリ全体が白画面になるのを防ぐ。
 * React の仕様上クラスコンポーネントでしか実装できない。
 */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('画面描画エラー:', error, info?.componentStack)
  }

  handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className={styles.container} role="alert">
        <div className={styles.card}>
          <span className={styles.icon} aria-hidden="true"><IconWarning /></span>
          <h1 className={styles.title}>表示できませんでした</h1>
          <p className={styles.desc}>
            一時的な不具合が発生しました。もう一度お試しください。
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.primaryBtn} onClick={this.handleReset}>
              再試行
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => { window.location.href = '/' }}
            >
              ホームへ
            </button>
          </div>
        </div>
      </div>
    )
  }
}
