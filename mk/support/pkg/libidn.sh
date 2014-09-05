
version=1.28

src_url=http://ftp.gnu.org/gnu/libidn/libidn-$version.tar.gz

pkg_link-flags () {
    local lib="$install_dir/lib/lib$(lc $1).a"
    if [[ ! -e "$lib" ]]; then
        echo "pkg.sh: error: static library was not built: $lib" >&2
        exit 1
    fi
    
    TEMPFILE=$(mktemp libiconv_check.XXXXXX).c
    if $(cc -liconv "$TEMPFILE" 2>/dev/null); then
        echo "-liconv $lib"
    elif $(cc "$TEMPFILE" >/dev/null); then
        echo "$lib"
    else
        rm "$TEMPFILE"
        echo "Unable to compile in libiconv" >&2
        exit 1
    fi
    rm "$TEMPFILE"
}
