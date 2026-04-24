@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #111827;
  --muted: #f3f4f6;
  --muted-foreground: #6b7280;
  --border: #e5e7eb;
  --primary: #0f172a;
  --primary-foreground: #ffffff;
  --destructive: #b91c1c;
  --radius: 0.75rem;
}

* {
  border-color: var(--border);
}

body {
  margin: 0;
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}

@media print {
  .no-print {
    display: none !important;
  }

  body {
    background: white;
  }

  main {
    padding: 0 !important;
  }
}
