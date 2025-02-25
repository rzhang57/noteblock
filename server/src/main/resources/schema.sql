-- Drop tables if they exist (for a clean slate on each startup)
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS folders;

-- Create the folders table
CREATE TABLE folders (
                         id INTEGER PRIMARY KEY AUTOINCREMENT,
                         name TEXT NOT NULL,
                         created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                         updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create the notes table
CREATE TABLE notes (
                       id INTEGER PRIMARY KEY AUTOINCREMENT,
                       folder_id INTEGER NOT NULL,
                       title TEXT NOT NULL,
                       content TEXT,
                       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                       updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                       FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);
