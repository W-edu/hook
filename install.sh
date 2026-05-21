#!/bin/sh
set -e

REPO="alecswanky/hook"
BINARY="hook"

# prefer /usr/local/bin (always on PATH on Mac), fall back to ~/.local/bin
if [ -w "/usr/local/bin" ] || mkdir -p "/usr/local/bin" 2>/dev/null && [ -w "/usr/local/bin" ]; then
  INSTALL_DIR="/usr/local/bin"
else
  INSTALL_DIR="$HOME/.local/bin"
fi

# colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { printf "${BOLD}%s${RESET}\n" "$1"; }
success() { printf "${GREEN}✓${RESET} %s\n" "$1"; }
warn()    { printf "${YELLOW}!${RESET} %s\n" "$1"; }
error()   { printf "${RED}✗${RESET} %s\n" "$1" >&2; exit 1; }

# ---- platform check ----

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) ;;
  *) error "hook currently only supports macOS. Linux and Windows support is coming." ;;
esac

case "$ARCH" in
  arm64)  ASSET="hook-darwin-arm64" ;;
  x86_64) ASSET="hook-darwin-x86_64" ;;
  *)      error "Unsupported architecture: $ARCH" ;;
esac

# ---- cloudflared ----

printf "\n"
info "hook — Shopify webhook interceptor"
printf "\n"
printf "hook uses ${BOLD}cloudflared${RESET} to create a secure tunnel from Shopify to your machine.\n\n"
printf "  ${BOLD}1)${RESET} Install cloudflared via Homebrew  (recommended)\n"
printf "  ${BOLD}2)${RESET} Skip — I will install it myself\n"
printf "\n"
printf "Choose [1/2]: "
read -r CF_CHOICE

case "$CF_CHOICE" in
  1)
    if command -v brew >/dev/null 2>&1; then
      info "Installing cloudflared..."
      brew install cloudflared
      success "cloudflared installed"
    else
      warn "Homebrew not found. Install it from https://brew.sh then run: brew install cloudflared"
      warn "Continuing with hook installation — you will need cloudflared before running hook."
    fi
    ;;
  2)
    warn "Skipping cloudflared. Install it before using hook: brew install cloudflared"
    ;;
  *)
    error "Invalid choice. Re-run the installer and enter 1 or 2."
    ;;
esac

# ---- fetch latest release version ----

printf "\n"
info "Fetching latest hook release..."

LATEST=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
  | grep '"tag_name"' \
  | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')

if [ -z "$LATEST" ]; then
  error "Could not determine latest release. Check your internet connection or visit https://github.com/${REPO}/releases"
fi

info "Installing hook ${LATEST}..."

# ---- download binary ----

URL="https://github.com/${REPO}/releases/download/${LATEST}/${ASSET}"
TMP="$(mktemp)"

if ! curl -fsSL "$URL" -o "$TMP"; then
  rm -f "$TMP"
  error "Download failed. Check https://github.com/${REPO}/releases for available assets."
fi

chmod +x "$TMP"

# ---- install ----

mkdir -p "$INSTALL_DIR"
mv "$TMP" "${INSTALL_DIR}/${BINARY}"
success "hook ${LATEST} installed to ${INSTALL_DIR}/${BINARY}"

# ---- PATH check (only relevant if fell back to ~/.local/bin) ----

case ":$PATH:" in
  *":${INSTALL_DIR}:"*) ;;
  *)
    printf "\n"
    warn "${INSTALL_DIR} is not in your PATH."
    warn "Add the following to your shell profile (~/.zshrc or ~/.bash_profile):"
    printf "\n  export PATH=\"${INSTALL_DIR}:\$PATH\"\n\n"
    ;;
esac

printf "\n"
success "Done. Run ${BOLD}hook --help${RESET} to get started."
printf "\n"
