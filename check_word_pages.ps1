try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    Write-Output "Word version: $($word.Version)"
    $file = (Get-ChildItem -Path "c:\Downloads\CiteKurs" -Filter "*.docx" | Sort-Object LastWriteTime -Descending)[0]
    Write-Output "Opening file: $($file.Name)"
    $doc = $word.Documents.Open($file.FullName)
    $pages = $doc.ComputeStatistics(2)
    $words = $doc.ComputeStatistics(0)
    Write-Output "EXACT_PAGES: $pages"
    Write-Output "EXACT_WORDS: $words"
    $doc.Save()
    $doc.Close()
    $word.Quit()
} catch {
    Write-Output "Error: $_"
}
