package util

import (
	"archive/zip"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// writeZip creates a zip archive at path containing the given name->content
// entries.
func writeZip(t *testing.T, path string, files map[string]string) {
	t.Helper()

	out, err := os.Create(path)
	require.NoError(t, err)
	defer out.Close()

	zw := zip.NewWriter(out)
	for name, content := range files {
		w, err := zw.Create(name)
		require.NoError(t, err)
		_, err = w.Write([]byte(content))
		require.NoError(t, err)
	}
	require.NoError(t, zw.Close())
}

func TestExtractArchiveSingleFile(t *testing.T) {
	dir := t.TempDir()
	archivePath := filepath.Join(dir, "book.zip.temp")

	writeZip(t, archivePath, map[string]string{
		"book.epub": "hello world",
	})

	require.True(t, IsArchive(archivePath))

	extractedPath, err := ExtractArchive(archivePath)
	require.NoError(t, err)

	// The original archive should be gone.
	_, err = os.Stat(archivePath)
	assert.True(t, os.IsNotExist(err), "expected archive to be removed, got err=%v", err)

	// The extracted file should exist with the expected content and name.
	assert.Equal(t, filepath.Join(dir, "book.epub.temp"), extractedPath)

	content, err := os.ReadFile(extractedPath)
	require.NoError(t, err)
	assert.Equal(t, "hello world", string(content))
}

func TestExtractArchiveMultipleFiles(t *testing.T) {
	dir := t.TempDir()
	archivePath := filepath.Join(dir, "book.zip.temp")

	writeZip(t, archivePath, map[string]string{
		"book.epub":  "hello world",
		"readme.txt": "extra file",
	})

	require.True(t, IsArchive(archivePath))

	resultPath, err := ExtractArchive(archivePath)
	require.NoError(t, err)

	// The original archive should still be present and returned unchanged.
	assert.Equal(t, archivePath, resultPath)

	_, err = os.Stat(archivePath)
	require.NoError(t, err, "expected archive to still exist")

	// Neither extracted file should remain on disk.
	_, err = os.Stat(filepath.Join(dir, "book.epub.temp"))
	assert.True(t, os.IsNotExist(err), "expected extracted file to be removed, got err=%v", err)

	_, err = os.Stat(filepath.Join(dir, "readme.txt.temp"))
	assert.True(t, os.IsNotExist(err), "expected second extracted file to not exist, got err=%v", err)
}

func TestIsArchiveNonArchive(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "notanarchive.txt.temp")

	require.NoError(t, os.WriteFile(path, []byte("just some text"), 0o644))

	assert.False(t, IsArchive(path))
}
