# Arch Linux package

`PKGBUILD` for building mdedit as a native Arch package. It builds the tagged release
from source and follows the Arch package guidelines. It will be submitted to the AUR as
`mdedit` once new AUR accounts can be registered again. Until then, build it from here:

```sh
git clone https://github.com/timofey/mdedit.git
cd mdedit/packaging/aur
makepkg -si
```

`makepkg` downloads the release source tarball, so the rest of the checkout isn't used.
The build takes a few minutes, and the test suite runs as part of it. To skip the tests,
use `makepkg -si --nocheck`.

To update, pull and run `makepkg -si` again. `pkgver` in the `PKGBUILD` follows the
latest release.
