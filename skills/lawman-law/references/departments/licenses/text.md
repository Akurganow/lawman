# Reading a long license text

1. Keep the reply raw in the run folder of the tick, and only until the tick ends. This is the one place where the reply of a source is written to a file.
2. Clean the whole reply once. Cut the cleaned text into small files in the same folder.
   - A file holds at most 25 000 bytes and ends at the end of a line.
   - A line longer than that is cut at a character boundary.
3. End each file with a closing line that shows, in plain sight, its number and the number of files. Read the files one at a time. Never read the raw reply.
4. Print each file with a command that ends successfully. Write no output limit into the entry.
5. The patrol reads the first 4 000 bytes and names the family. The read ends with a line that gives the number of files and the size of the text.
   - The patrol reads on in three cases.
     - The text is not standard.
     - The text is longer than the standard text of its family.
     - The family can yield a finding on the page.
   - You decide what is standard from that start. No reference texts exist.
6. The investigation reads all the files.
7. A closing line belongs to a file read whole. A file without its line, and a text with a needed file unread, is `unclear`. It goes to Coverage with no quote and no ground for a finding.
   - Item 7 does not apply to the 4 000-byte read of the patrol. That read is whole when it ends with the line that gives the number of files and the size of the text.
8. Take the quote from the cleaned text. Leave out placeholder lines such as `<year>`.
