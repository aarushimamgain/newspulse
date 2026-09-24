import './globals.css';

export const metadata = {
  title: 'News Pulse — Topic-Clustered News Timeline',
  description: 'A simple news timeline grouping articles from BBC, NPR, and Guardian into topic clusters.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
