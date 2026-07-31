#!/usr/bin/env bash
set -euo pipefail

expected_arch="${1:-}"
case "${expected_arch}" in
  x64)
    expected_macho_arch="x86_64"
    ;;
  arm64)
    expected_macho_arch="arm64"
    ;;
  *)
    echo "Usage: scripts/verify-mac-dmg.sh <x64|arm64> [dmg-path]" >&2
    exit 2
    ;;
esac

verification_mode="${3:-bundle}"
case "${verification_mode}" in
  bundle|developer-id)
    ;;
  *)
    echo "Usage: scripts/verify-mac-dmg.sh <x64|arm64> [dmg-path] [bundle|developer-id]" >&2
    exit 2
    ;;
esac

expected_version="$(node -p "require('./package.json').version")"
dmg_path="${2:-release/Memento-${expected_version}-${expected_arch}.dmg}"
if [[ ! -f "${dmg_path}" ]]; then
  echo "DMG not found: ${dmg_path}" >&2
  exit 1
fi

mount_directory="$(mktemp -d "${TMPDIR:-/tmp}/memento-dmg.XXXXXX")"
mounted=false
cleanup() {
  if [[ "${mounted}" == true ]]; then
    hdiutil detach "${mount_directory}" >/dev/null
  fi
  rmdir "${mount_directory}"
}
trap cleanup EXIT

hdiutil verify "${dmg_path}"
hdiutil attach -readonly -nobrowse -mountpoint "${mount_directory}" "${dmg_path}" >/dev/null
mounted=true

app_path="${mount_directory}/Memento.app"
executable_path="${app_path}/Contents/MacOS/Memento"
plist_path="${app_path}/Contents/Info.plist"
if [[ ! -x "${executable_path}" || ! -f "${plist_path}" ]]; then
  echo "Mounted DMG does not contain a complete Memento.app" >&2
  exit 1
fi

actual_version="$(plutil -extract CFBundleShortVersionString raw "${plist_path}")"
if [[ "${actual_version}" != "${expected_version}" ]]; then
  echo "App version ${actual_version} does not match package version ${expected_version}" >&2
  exit 1
fi

architecture="$(file "${executable_path}")"
if [[ "${architecture}" != *"${expected_macho_arch}"* ]]; then
  echo "Unexpected executable architecture: ${architecture}" >&2
  exit 1
fi

codesign --verify --deep --strict --verbose=4 "${app_path}"
signature="$(codesign -d --verbose=4 "${app_path}" 2>&1)"
if [[ "${signature}" != *"Identifier=com.fcl.memento"* ]]; then
  echo "Unexpected application signature identity:" >&2
  echo "${signature}" >&2
  exit 1
fi

if [[ "${verification_mode}" == developer-id ]]; then
  expected_identity="${APPLE_SIGNING_IDENTITY:-}"
  expected_team_id="${APPLE_TEAM_ID:-}"
  if [[ -z "${expected_identity}" || -z "${expected_team_id}" ]]; then
    echo "APPLE_SIGNING_IDENTITY and APPLE_TEAM_ID are required for Developer ID verification" >&2
    exit 1
  fi
  if [[ "${signature}" != *"Authority=${expected_identity}"* ||
        "${signature}" != *"TeamIdentifier=${expected_team_id}"* ]]; then
    echo "Application is not signed by the expected Developer ID identity:" >&2
    echo "${signature}" >&2
    exit 1
  fi

  codesign --verify --strict --verbose=2 "${dmg_path}"
  dmg_signature="$(codesign -d --verbose=4 "${dmg_path}" 2>&1)"
  if [[ "${dmg_signature}" != *"Authority=${expected_identity}"* ||
        "${dmg_signature}" != *"TeamIdentifier=${expected_team_id}"* ||
        "${dmg_signature}" != *"Timestamp="* ]]; then
    echo "DMG is not signed and timestamped by the expected Developer ID identity:" >&2
    echo "${dmg_signature}" >&2
    exit 1
  fi
  spctl --assess --type execute --verbose=4 "${app_path}"
  spctl --assess --type open --context context:primary-signature --verbose=4 "${dmg_path}"
  xcrun stapler validate "${app_path}"
  xcrun stapler validate "${dmg_path}"
fi

echo "Verified Memento ${actual_version} ${expected_macho_arch} DMG (${verification_mode})"
