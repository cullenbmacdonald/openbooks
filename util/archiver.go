package util

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"os"
	"path/filepath"

	"github.com/mholt/archives"
)

var (
	ErrNotFullyCopied = errors.New("didn't copy entire file from the archive")
)

// realName returns the name to use for archive format identification. Our
// downloaded files have ".temp" appended to the real filename, so strip that
// off before handing the name to archives.Identify -- the actual content is
// still sniffed from the file's magic bytes too, so this is just a hint.
func realName(path string) string {
	if filepath.Ext(path) == ".temp" {
		return path[:len(path)-len(".temp")]
	}
	return path
}

// identifyArchive opens archivePath and identifies its format, using both the
// (".temp"-stripped) filename and the file's contents as hints. The caller is
// responsible for closing the returned file.
func identifyArchive(archivePath string) (archives.Format, *os.File, error) {
	file, err := os.Open(archivePath)
	if err != nil {
		return nil, nil, err
	}

	format, _, err := archives.Identify(context.Background(), filepath.Base(realName(archivePath)), file)
	if err != nil {
		file.Close()
		return nil, nil, err
	}

	return format, file, nil
}

func ExtractArchive(archivePath string) (string, error) {
	format, file, err := identifyArchive(archivePath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	extractor, ok := format.(archives.Extractor)
	if !ok {
		return "", fmt.Errorf("format identified for archive is not an extractor format: %s (%T)", archivePath, format)
	}

	var newPath string
	err = extractor.Extract(context.Background(), file, func(_ context.Context, f archives.FileInfo) error {
		if f.IsDir() {
			return nil
		}

		// Extract only one file per archive. Otherwise, stop extracting,
		// remove extracted items, and deliver the archive itself.
		if newPath != "" {
			err := os.Remove(newPath)
			if err != nil {
				return err
			}
			newPath = ""
			return fs.SkipAll
		}

		newPath = filepath.Join(filepath.Dir(archivePath), filepath.Base(f.NameInArchive)+".temp")

		out, err := os.Create(newPath)
		if err != nil {
			return err
		}
		defer out.Close()

		in, err := f.Open()
		if err != nil {
			return err
		}
		defer in.Close()

		copied, err := io.Copy(out, in)
		if err != nil {
			return err
		}
		if copied != f.Size() {
			return ErrNotFullyCopied
		}

		return nil
	})

	if err != nil {
		return "", err
	}

	// If we extracted exactly one file, send that file and remove the zip file.
	// Otherwise, send the archive itself.
	if newPath != "" {
		file.Close()
		err := os.Remove(archivePath)
		if err != nil {
			log.Println("remove error", err)
		}
		return newPath, nil
	} else {
		return archivePath, nil
	}
}

// IsArchive returns true if the file at the given path is an archive that can
// be extracted. Returns false otherwise.
func IsArchive(path string) bool {
	format, file, err := identifyArchive(path)
	if err != nil {
		return false
	}
	defer file.Close()

	_, ok := format.(archives.Extractor)
	return ok
}
