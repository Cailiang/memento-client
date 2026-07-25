import { createContext, useContext } from 'react'
import type { AppLanguage } from '../../shared/app-settings'

interface I18nValue {
  language: AppLanguage
  locale: string
  text: (chinese: string, english: string) => string
}

const I18nContext = createContext<I18nValue>({
  language: 'zh-CN',
  locale: 'zh-CN',
  text: (chinese) => chinese
})

export function I18nProvider({
  language,
  children
}: {
  language: AppLanguage
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <I18nContext.Provider
      value={{
        language,
        locale: language,
        text: (chinese, english) => language === 'en-US' ? english : chinese
      }}
    >
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nValue {
  return useContext(I18nContext)
}
