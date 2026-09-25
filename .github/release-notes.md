## Downloads

| Platform | File |
|---|---|
| Windows 10/11 | `mdedit_*_x64-setup.exe` (installer), or `mdedit_*_x64-portable.exe` (no install) |
| macOS (Intel and Apple Silicon) | `mdedit_*_universal.dmg` |
| Debian / Ubuntu | `mdedit_*_amd64.deb`, installed with `sudo apt install ./mdedit_*.deb` |
| Fedora / openSUSE | `mdedit-*.x86_64.rpm` |
| Any Linux distro | `mdedit_*_amd64.AppImage` (`chmod +x` and run), or `mdedit-*-linux-x86_64.tar.gz` (plain binary) |

**Windows:** the installer isn't code-signed, so SmartScreen may show "Windows protected your PC".
Click **More info**, then **Run anyway**.

**macOS:** the app isn't signed with an Apple Developer ID, so macOS blocks the first launch.
After moving mdedit to Applications, run:

```sh
xattr -dr com.apple.quarantine /Applications/mdedit.app
```

You can also right-click the app, choose **Open**, and confirm.

**Linux tarball:** the plain binary needs WebKitGTK 4.1 installed (`webkit2gtk-4.1` on Arch,
`libwebkit2gtk-4.1-0` on Debian/Ubuntu, `webkit2gtk4.1` on Fedora).
