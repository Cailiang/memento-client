import { describe, expect, it } from 'vitest'
import { parseLiteralHomeExport } from './scanner'

describe('shell environment inspection', () => {
  it('accepts literal absolute *_HOME exports', () => {
    expect(parseLiteralHomeExport(
      'export POSTGRESQL_HOME=/usr/local/Cellar/postgresql/12.3_2'
    )).toEqual({
      variable: 'POSTGRESQL_HOME',
      value: '/usr/local/Cellar/postgresql/12.3_2'
    })
    expect(parseLiteralHomeExport(
      "export ANDROID_HOME='/Users/example/Library/Android SDK' # old"
    )).toEqual({
      variable: 'ANDROID_HOME',
      value: '/Users/example/Library/Android SDK'
    })
  })

  it('rejects interpolation, commands, relative paths, and unrelated variables', () => {
    expect(parseLiteralHomeExport('export JAVA_HOME=$(/usr/libexec/java_home)')).toBeNull()
    expect(parseLiteralHomeExport('export TOOL_HOME="$HOME/tool"')).toBeNull()
    expect(parseLiteralHomeExport('export TOOL_HOME=../tool')).toBeNull()
    expect(parseLiteralHomeExport('export API_KEY=/not/a/product/home')).toBeNull()
    expect(parseLiteralHomeExport('# export TOOL_HOME=/missing')).toBeNull()
  })
})
