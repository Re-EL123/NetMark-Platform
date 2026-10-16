import { apiRequest } from './api';
import { supabase } from './supabase';
import { esc } from './render';
import { icon } from './icons';

export type UploadKind = 'image' | 'video' | 'file' | 'document' | 'gallery' | 'documents';

export interface UploadField {
  name: string;
  label: string;
  kind?: UploadKind;
  folder?: string;
  value?: any;
  required?: boolean;
  help?: string;
  accept?: string;
  multiple?: boolean;
  full?: boolean;
}

const ACCEPTS: Record<UploadKind, string> = {
  image: 'image/*',
  video: 'video/*',
  file: '*/*',
  document: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,image/*',
  gallery: 'image/*',
  documents: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,image/*'
};

/** Mint a signed upload URL and push a file straight to Supabase Storage. */
export async function uploadFile(file: File, folder: string, onProgress?: (pct: number) => void): Promise<string> {
  const sign = await apiRequest('/uploads/sign', {
    method: 'POST',
    body: JSON.stringify({ folder, filename: file.name })
  });
  if (!sign?.success || !sign.data) throw new Error(sign?.message || 'Could not start upload');
  const { bucket, path, token, publicUrl } = sign.data;
  onProgress?.(10);
  const { error } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(path, token, file, { contentType: file.type || undefined });
  if (error) throw new Error(error.message || 'Upload failed');
  onProgress?.(100);
  return publicUrl;
}

function mediaUrl(v: any): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  return v.url || v.src || '';
}

function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|svg|bmp|heic)(\?|$)/i.test(url) || url.startsWith('data:image');
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(url);
}

function thumbHtml(value: any, kind: UploadKind): string {
  const url = mediaUrl(value);
  if (!url) {
    const iconName = kind === 'video' ? 'video' : kind === 'document' || kind === 'documents' || kind === 'file' ? 'file-text' : 'image';
    return `<span class="upload-empty">${icon(iconName)}</span>`;
  }
  if (isImageUrl(url) || kind === 'image' || kind === 'gallery') {
    return `<img src="${esc(url)}" alt="" loading="lazy" />`;
  }
  if (isVideoUrl(url) || kind === 'video') {
    return `<span class="upload-file-chip">${icon('video')}</span>`;
  }
  return `<span class="upload-file-chip">${icon('file-text')}</span>`;
}

function itemListHtml(value: any, kind: UploadKind): string {
  const items: any[] = Array.isArray(value) ? value : [];
  if (!items.length) return '';
  return `<div class="upload-items">${items
    .map((it) => {
      const url = mediaUrl(it);
      const name = (typeof it === 'object' && it?.name) || url.split('/').pop() || 'file';
      const thumb =
        isImageUrl(url) || kind === 'gallery'
          ? `<img src="${esc(url)}" alt="" loading="lazy" />`
          : `<span class="upload-file-chip">${icon('file-text')}</span>`;
      return `<span class="upload-item" data-url="${esc(url)}">
        <span class="upload-item-thumb">${thumb}</span>
        <span class="upload-item-name">${esc(name)}</span>
        <button type="button" class="upload-item-remove" data-upload-remove title="Remove" aria-label="Remove">${icon('x')}</button>
      </span>`;
    })
    .join('')}</div>`;
}

/** Render an upload control (single image/video/file or a multi-item list). */
export function uploadFieldHtml(f: UploadField): string {
  const kind = f.kind || 'image';
  const multiple = f.multiple ?? (kind === 'gallery' || kind === 'documents');
  const folder = f.folder || 'misc';
  const accept = f.accept || ACCEPTS[kind];
  const hiddenValue = multiple
    ? Array.isArray(f.value)
      ? JSON.stringify(f.value)
      : f.value || '[]'
    : f.value || '';
  const single = mediaUrl(f.value);

  const preview = multiple
    ? itemListHtml(f.value, kind)
    : `<span class="upload-thumb">${thumbHtml(f.value, kind)}</span>`;

  return `<div class="form-group upload-group ${f.full ? 'full' : ''}" data-upload data-folder="${esc(folder)}" data-accept="${esc(
    accept
  )}" data-kind="${esc(kind)}" data-multiple="${multiple ? 'true' : 'false'}">
    <label>${esc(f.label)}${f.required ? ' *' : ''}</label>
    <input type="hidden" name="${esc(f.name)}" id="f_${esc(f.name)}" value="${esc(hiddenValue)}" data-upload-value />
    ${
      multiple
        ? `<div class="upload-multi-preview" data-upload-list>${preview}</div>`
        : `<div class="upload-single-preview" data-upload-preview>${preview}</div>`
    }
    <div class="upload-controls">
      <button type="button" class="btn btn-ghost btn-sm" data-upload-pick>${icon('upload')}<span>Upload file</span></button>
      <input type="file" ${multiple ? 'multiple' : ''} accept="${esc(accept)}" data-upload-input style="display:none" />
      ${
        multiple
          ? ''
          : `<input type="text" class="upload-url" placeholder="…or paste a URL" value="${esc(single)}" data-upload-url />`
      }
      ${!multiple && single ? `<button type="button" class="btn btn-ghost btn-sm" data-upload-clear title="Remove">${icon('x')}</button>` : ''}
    </div>
    <span class="upload-status" data-upload-status></span>
    ${f.help ? `<p class="empty" style="font-size:12px">${esc(f.help)}</p>` : ''}
  </div>`;
}

function parseHidden(el: HTMLInputElement, multiple: boolean): any {
  if (!multiple) return el.value;
  try {
    const v = JSON.parse(el.value || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function updateSingle(group: HTMLElement) {
  const input = group.querySelector('[data-upload-value]') as HTMLInputElement;
  const kind = (group.dataset.kind || 'image') as UploadKind;
  const preview = group.querySelector('[data-upload-preview]');
  const url = group.querySelector('[data-upload-url]') as HTMLInputElement | null;
  if (preview) preview.innerHTML = `<span class="upload-thumb">${thumbHtml(input.value, kind)}</span>`;
  if (url) url.value = input.value;
  const clear = group.querySelector('[data-upload-clear]');
  if (clear) clear.remove();
  if (input.value) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost btn-sm';
    btn.setAttribute('data-upload-clear', '');
    btn.title = 'Remove';
    btn.innerHTML = icon('x');
    group.querySelector('.upload-controls')?.appendChild(btn);
  }
}

function updateMultiple(group: HTMLElement) {
  const input = group.querySelector('[data-upload-value]') as HTMLInputElement;
  const kind = (group.dataset.kind || 'gallery') as UploadKind;
  const list = group.querySelector('[data-upload-list]');
  const items = parseHidden(input, true);
  if (list) list.innerHTML = itemListHtml(items, kind);
}

/** Attach behaviour to every upload control inside `scope`. */
export function wireUploaders(scope: ParentNode): void {
  scope.querySelectorAll<HTMLElement>('[data-upload]').forEach((group) => {
    if (group.dataset.wired) return;
    group.dataset.wired = 'true';
    const input = group.querySelector('[data-upload-value]') as HTMLInputElement;
    const fileInput = group.querySelector('[data-upload-input]') as HTMLInputElement;
    const pick = group.querySelector('[data-upload-pick]');
    const status = group.querySelector('[data-upload-status]') as HTMLElement | null;
    const multiple = group.dataset.multiple === 'true';
    const folder = group.dataset.folder || 'misc';

    const setStatus = (msg: string, tone: '' | 'error' = '') => {
      if (!status) return;
      status.textContent = msg;
      status.className = `upload-status ${tone}`;
    };

    pick?.addEventListener('click', () => fileInput?.click());

    fileInput?.addEventListener('change', async () => {
      const files = Array.from(fileInput.files || []);
      if (!files.length) return;
      fileInput.disabled = true;
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          setStatus(`Uploading ${i + 1}/${files.length}…`);
          const url = await uploadFile(file, folder, (pct) => setStatus(`Uploading ${file.name}… ${pct}%`));
          if (multiple) {
            const items = parseHidden(input, true);
            items.push({ url, name: file.name });
            input.value = JSON.stringify(items);
          } else {
            input.value = url;
          }
        }
        setStatus('Uploaded', '');
        if (multiple) updateMultiple(group);
        else updateSingle(group);
      } catch (err: any) {
        setStatus(err?.message || 'Upload failed', 'error');
      } finally {
        fileInput.disabled = false;
        fileInput.value = '';
      }
    });

    group.querySelector('[data-upload-url]')?.addEventListener('input', (e) => {
      input.value = (e.target as HTMLInputElement).value.trim();
      updateSingle(group);
      (group.querySelector('[data-upload-url]') as HTMLInputElement | null)?.focus();
    });

    group.addEventListener('click', (e) => {
      const clear = (e.target as HTMLElement).closest('[data-upload-clear]');
      if (clear) {
        input.value = '';
        if (multiple) updateMultiple(group);
        else updateSingle(group);
        setStatus('');
        return;
      }
      const remove = (e.target as HTMLElement).closest('[data-upload-remove]');
      if (remove) {
        const url = (remove.closest('[data-url]') as HTMLElement)?.dataset.url;
        const items = parseHidden(input, true).filter((it: any) => mediaUrl(it) !== url);
        input.value = JSON.stringify(items);
        updateMultiple(group);
      }
    });
  });
}
