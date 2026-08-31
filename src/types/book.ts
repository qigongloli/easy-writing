import type { JsonRecord } from '@/types/json'
import { ReqPage } from "@/types";
import type { WorkflowQualityNotice } from "./workflow";

/**
 * 书籍模块 API
 */

export type BookSortBy = 'updateTime' | 'createTime' | 'wordCount' | 'title';
export type BookSortOrder = 'ASC' | 'DESC';

export interface ImportBookPreview {
  filename: string;
  title: string;
  intro?: string;
  meta?: JsonRecord;
  volumeCount: number;
  chapterCount: number;
  chaptersPreview: Array<{ title: string; wordCount: number }>;
  warnings: string[];
}

export interface ImportBookResult {
  bookId: number;
  title: string;
  volumeCount: number;
  chapterCount: number;
  totalWordCount: number;
  warnings: string[];
}

export interface ImportChaptersPreview {
  filename: string;
  volumeCount: number;
  chapterCount: number;
  volumes: Array<{ title: string; chapterCount: number }>;
  chaptersPreview: Array<{ title: string; wordCount: number }>;
  warnings: string[];
}

export interface ImportChaptersResult {
  bookId: number;
  addedVolumes: number;
  addedChapters: number;
  addedWordCount: number;
  updatedBookWordCount: number;
  createdChapterIds: number[];
  warnings: string[];
}

/**
 * 章节 (Chapter) 相关 API
 */

export interface ChapterHistoryItem {
  id: number;
  versionName: string;
  type: number;
  remark: string;
  source?: string;
  wordCount: number;
  createTime: string;
  preview: string;
  textContent: string;
  contentVersion?: number | null;
  modelCode?: string;
  reviewSnapshot?: WorkflowQualityNotice | null;
}

/**
 * 角色 (Character) 相关 API
 */

/**
 * 世界观设定 (WorldSetting) 相关 API
 */
