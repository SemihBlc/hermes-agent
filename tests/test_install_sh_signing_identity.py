"""Regression contract for stable macOS desktop signing identity precedence."""

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
INSTALL_SH = REPO_ROOT / "scripts" / "install.sh"


def test_install_sh_matches_cli_macos_signing_identity_precedence() -> None:
    text = INSTALL_SH.read_text(encoding="utf-8")

    expected = 'local configured_signing_identity="${CSC_NAME:-${APPLE_SIGNING_IDENTITY:-}}"'
    reversed_precedence = 'local configured_signing_identity="${APPLE_SIGNING_IDENTITY:-${CSC_NAME:-}}"'

    assert expected in text, (
        "install.sh must prefer CSC_NAME over APPLE_SIGNING_IDENTITY, matching "
        "_effective_macos_signing_identity and keeping one stable signing identity"
    )
    assert reversed_precedence not in text
