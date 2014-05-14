
version=3.3.2

src_url=ftp://ftp.gnutls.org/gcrypt/gnutls/v${version%.*}/gnutls-$version.tar.xz

pkg_depends () {
    echo nettle
}
