<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0" 
                xmlns:html="http://www.w3.org/TR/REC-html40"
                xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
                xmlns:xsl="http://www.w3.org/2019/XSL/Transform">
  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html lang="en">
      <head>
        <title>TradeHelp XML Sitemap</title>
        <meta charset="utf-8"/>
        <style>
          body { background: #0E1117; color: #E6EAF2; font-family: ui-sans-serif, system-ui, sans-serif; padding: 40px 20px; max-width: 900px; margin: 0 auto; }
          h1 { color: #F5B642; font-size: 24px; margin-bottom: 8px; }
          p { color: #8A94A6; font-size: 14px; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; background: #151B26; border: 1px solid #2A3344; border-radius: 12px; overflow: hidden; }
          th { background: #1C2433; color: #E6EAF2; text-align: left; padding: 12px 16px; font-size: 13px; border-bottom: 1px solid #2A3344; }
          td { padding: 12px 16px; border-bottom: 1px solid #2A3344; font-size: 14px; color: #8A94A6; }
          tr:last-child td { border-bottom: none; }
          a { color: #F5B642; text-decoration: none; font-weight: 500; }
          a:hover { text-decoration: underline; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; background: rgba(52, 211, 153, 0.15); color: #34D399; font-size: 12px; font-weight: 600; }
        </style>
      </head>
      <body>
        <h1>TradeHelp XML Sitemap</h1>
        <p>This is an XML sitemap generated for Google Search Console and web crawlers. <a href="./">Return to Homepage →</a></p>
        <table>
          <thead>
            <tr>
              <th>URL Location</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            <xsl:for-each select="sitemap:urlset/sitemap:url">
              <tr>
                <td>
                  <a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a>
                </td>
                <td>
                  <span class="badge"><xsl:value-of select="sitemap:priority"/></span>
                </td>
              </tr>
            </xsl:for-each>
          </tbody>
        </table>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
