#!/usr/bin/env bash
# Downloads the three images the app used to hotlink from Google's CDN
# (lh3.googleusercontent.com, unreachable from some networks) into public/.
#
# Run this on a machine that CAN reach Google (e.g. the Mac where the images
# loaded fine), from the project root:
#
#   bash scripts/fetch-assets.sh
#
# Requires: curl, sips (both preinstalled on macOS).
set -euo pipefail

cd "$(dirname "$0")/.."

fetch() {
  local url="$1" out="$2" format="$3"
  local tmp
  tmp="$(mktemp)"
  echo "Downloading $out ..."
  curl -fsSL -m 60 -o "$tmp" "$url"
  # Normalize to the exact format the filename claims, so browsers never
  # have to sniff mismatched bytes.
  sips -s format "$format" "$tmp" --out "public/$out" >/dev/null
  rm -f "$tmp"
  echo "  -> public/$out"
}

fetch "https://lh3.googleusercontent.com/aida-public/AB6AXuB6LMMBlmViXMDSKZlMYrMd5D8inp5eab_TQBPnlXZyTcv2yqEBBOFxhgyFh6jh_pfJxrM_qL6s0Llqf9dmVW8W1lvpQDw76T-zU67Dz_RoVZonj-NuSv2JMV043y_q58aMV7_vss3qkeRL_02NxW9mEVnRCc6eewLJFzB0X8UAltchTx2KyePsGzPY0i_Y-JxEeHdc69NyEhsIGopz7OgRfkUtWecEOIv9Gcq84T6gzx0DZsqOJoO0" \
  "calibration-bg.jpg" "jpeg"

fetch "https://lh3.googleusercontent.com/aida-public/AB6AXuBbSKwZckUA1VdysPkrJ_hGuuE3eCEHCk6LfYaSg6jK6RwmXRKBQLg2cmtugAbXxb-qe0lWOno7uqJIR7WOen6wp0Emr5VGa_HC1mwVbWDBPtMpoUNEezKHElDlrimx2P0XEv3AABz-_S_vhMTXx1aoaknM3ZESGuEdu3xJnMUkB4dZ8pe3BsRnEET_Ki6iICyTpp-koJ6pg5TcY69TSZLJvrKN1CNpX1LrZB1k86qBcuB3jXLXoysc" \
  "trophy.jpg" "jpeg"

fetch "https://lh3.googleusercontent.com/aida-public/AB6AXuCU8N0o6n2nU7TPm-bakO1gnAsgq7WkhP2ZE16-Ssmu-3GnaN0eo5JAC-FScc44lpXgnwAJcXdTf-43ZymmnpW5N6GLgXilkSj6CUxameJTxYxULe3An6SDU9xL1X0Nxya-CIW-xED7V6eHiQj4-eficQMxntmQBCSpsOCARJV8lrP-C17EkZroBKjc4WF9dbr4AHRwklLrtHK6gU1gG79BX-_xf-uiHUbcEtYWXA9dfxy97O8Eyf_W" \
  "mascot-shiba.png" "png"

echo "Done. Commit or copy the public/ folder back to the Windows machine."
