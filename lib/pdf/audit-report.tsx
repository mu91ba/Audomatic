import React from 'react'
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { type Page as PageType, type Audit } from '../supabase'
import { detectUrlPattern } from '../utils'

export async function renderReport(audit: Audit, pages: PageType[]) {
  return renderToBuffer(<AuditReportDocument audit={audit} pages={pages} />)
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    backgroundColor: '#f8fafc',
  },
  // Cover page
  coverPage: {
    padding: 40,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 12,
    textAlign: 'center',
  },
  coverUrl: {
    fontSize: 14,
    color: '#6366f1',
    marginBottom: 30,
    textAlign: 'center',
  },
  coverMeta: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 6,
    textAlign: 'center',
  },
  coverFooter: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 10,
    color: '#94a3b8',
  },
  // Section headings
  sectionHeading: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 16,
    paddingBottom: 6,
    borderBottom: '2px solid #e2e8f0',
  },
  levelHeading: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#475569',
    marginBottom: 10,
    marginTop: 16,
  },
  // Card grid
  cardRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  // Page card
  card: {
    width: 165,
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    marginBottom: 12,
  },
  cardHeader: {
    padding: '6 8',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
  },
  cardTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  cardImage: {
    width: '100%',
    height: 120,
  },
  cardImagePlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: '#f1f5f9',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardFooter: {
    padding: '4 8',
    backgroundColor: '#f8fafc',
    borderTop: '1px solid #e2e8f0',
  },
  cardUrl: {
    fontSize: 6.5,
    color: '#64748b',
    fontFamily: 'Courier',
  },
  // Grouped card
  groupCard: {
    width: 165,
    border: '1.5px solid #a5b4fc',
    borderRadius: 6,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    marginBottom: 12,
  },
  groupHeader: {
    padding: '6 8',
    backgroundColor: '#eef2ff',
    borderBottom: '1px solid #c7d2fe',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  groupPattern: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#3730a3',
  },
  groupBadge: {
    backgroundColor: '#4f46e5',
    color: '#ffffff',
    fontSize: 7,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
  },
  groupUrlList: {
    padding: '4 8',
    borderTop: '1px solid #e2e8f0',
  },
  groupUrlItem: {
    fontSize: 6,
    color: '#64748b',
    fontFamily: 'Courier',
    marginBottom: 2,
  },
  // Standalone section
  standaloneSection: {
    marginTop: 20,
    padding: 16,
    border: '1px dashed #cbd5e1',
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  standaloneLabel: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  // Footer
  pageFooter: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#94a3b8',
  },
})

function getPathname(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

function PageCard({ page }: { page: PageType }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>
          {(page.title || 'Untitled').substring(0, 40)}
        </Text>
      </View>
      {page.screenshot_url ? (
        <Image style={styles.cardImage} src={page.screenshot_url} />
      ) : (
        <View style={styles.cardImagePlaceholder}>
          <Text style={{ fontSize: 8, color: '#94a3b8' }}>No screenshot</Text>
        </View>
      )}
      <View style={styles.cardFooter}>
        <Text style={styles.cardUrl}>
          {getPathname(page.url)}
        </Text>
      </View>
    </View>
  )
}

function GroupedCard({ pattern, pages, count, screenshot }: {
  pattern: string
  pages: { url: string }[]
  count: number
  screenshot?: string
}) {
  return (
    <View style={styles.groupCard}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupPattern}>{pattern}</Text>
        <Text style={styles.groupBadge}>{count} pages</Text>
      </View>
      {screenshot ? (
        <Image style={styles.cardImage} src={screenshot} />
      ) : (
        <View style={styles.cardImagePlaceholder}>
          <Text style={{ fontSize: 8, color: '#94a3b8' }}>{count} pages</Text>
        </View>
      )}
      <View style={styles.groupUrlList}>
        {pages.slice(0, 20).map((p, i) => (
          <Text key={i} style={styles.groupUrlItem}>
            {getPathname(p.url)}
          </Text>
        ))}
        {pages.length > 20 && (
          <Text style={styles.groupUrlItem}>
            ... and {pages.length - 20} more
          </Text>
        )}
      </View>
    </View>
  )
}

interface AuditReportProps {
  audit: Audit
  pages: PageType[]
}

export function AuditReportDocument({ audit, pages }: AuditReportProps) {
  // Separate pages into categories
  const templatePages = pages.filter(p => p.is_template)
  const nonTemplatePages = pages.filter(p => !p.is_template)
  const standalonePages = nonTemplatePages.filter(p => p.source === 'sitemap_only')
  const linkedPages = nonTemplatePages.filter(p => p.source !== 'sitemap_only')

  // Group linked pages by level
  const pagesByLevel = new Map<number, PageType[]>()
  for (const page of linkedPages) {
    const level = page.level ?? 0
    if (!pagesByLevel.has(level)) pagesByLevel.set(level, [])
    pagesByLevel.get(level)!.push(page)
  }
  const sortedLevels = Array.from(pagesByLevel.keys()).sort((a, b) => a - b)

  const levelLabels: Record<number, string> = {
    0: 'Homepage',
    1: 'Main Pages',
    2: 'Sub Pages',
    3: 'Deep Pages',
    4: 'Level 4 Pages',
  }

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <Document>
      {/* Cover Page */}
      <Page size="A4" orientation="landscape" style={styles.coverPage}>
        <Text style={styles.coverTitle}>Website Audit Report</Text>
        <Text style={styles.coverUrl}>{audit.url}</Text>
        <Text style={styles.coverMeta}>{pages.length} pages analyzed</Text>
        <Text style={styles.coverMeta}>{today}</Text>
        <Text style={styles.coverFooter}>Generated by Audomatic</Text>
      </Page>

      {/* Hierarchy Pages */}
      {sortedLevels.map(level => {
        const levelPages = pagesByLevel.get(level)!
        return (
          <Page key={`level-${level}`} size="A4" orientation="landscape" style={styles.page} wrap>
            <Text style={styles.sectionHeading}>
              {levelLabels[level] || `Level ${level}`}
            </Text>
            <View style={styles.cardRow}>
              {levelPages.map((page, i) => (
                <PageCard key={i} page={page} />
              ))}
            </View>
            <View style={styles.pageFooter} fixed>
              <Text>{audit.url}</Text>
              <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
            </View>
          </Page>
        )
      })}

      {/* Template/Grouped Pages */}
      {templatePages.length > 0 && (
        <Page size="A4" orientation="landscape" style={styles.page} wrap>
          <Text style={styles.sectionHeading}>Grouped Pages</Text>
          <View style={styles.cardRow}>
            {templatePages.map((page, i) => {
              const pattern = detectUrlPattern(page.url) || page.url
              const groupUrls = page.template_urls
                ? page.template_urls.map(url => ({ url }))
                : [{ url: page.url }]
              return (
                <GroupedCard
                  key={i}
                  pattern={pattern}
                  pages={groupUrls}
                  count={page.template_count ?? 1}
                  screenshot={page.screenshot_url}
                />
              )
            })}
          </View>
          <View style={styles.pageFooter} fixed>
            <Text>{audit.url}</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}

      {/* Standalone Pages */}
      {standalonePages.length > 0 && (
        <Page size="A4" orientation="landscape" style={styles.page} wrap>
          <Text style={styles.sectionHeading}>Standalone Pages</Text>
          <Text style={styles.standaloneLabel}>
            Found in sitemap only - not linked from any crawled page
          </Text>
          <View style={styles.cardRow}>
            {standalonePages.map((page, i) => (
              <PageCard key={i} page={page} />
            ))}
          </View>
          <View style={styles.pageFooter} fixed>
            <Text>{audit.url}</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}
    </Document>
  )
}
