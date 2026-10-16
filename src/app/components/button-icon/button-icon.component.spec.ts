/**
 * Render-time icon policy (SPEC §3.1.3 + §3.1.4).
 *
 * The user-visible promise under test: an allowed icon (png/webp, relative,
 * absolute or inline data:) is bound to the image, while a disallowed format
 * (svg/jpg/data:image/svg+xml) never reaches the `src` and shows the initials
 * tile instead.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ButtonIconComponent } from './button-icon.component';

async function render(icon?: string, iconpath?: string): Promise<ComponentFixture<ButtonIconComponent>> {
  const fixture = TestBed.createComponent(ButtonIconComponent);
  fixture.componentRef.setInput('label', 'Get');
  fixture.componentRef.setInput('icon', icon);
  fixture.componentRef.setInput('iconpath', iconpath);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function imgSrc(fixture: ComponentFixture<ButtonIconComponent>): string | null {
  const img: HTMLImageElement | null = fixture.nativeElement.querySelector('img');
  return img === null ? null : img.getAttribute('src');
}

function tile(fixture: ComponentFixture<ButtonIconComponent>): string | null {
  const span: HTMLElement | null = fixture.nativeElement.querySelector('.initial');
  return span === null ? null : (span.textContent ?? '').trim();
}

describe('ButtonIconComponent icon format enforcement (SPEC §3.1)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ButtonIconComponent] });
  });

  it('binds the image for relative png/webp icons', async () => {
    const png = await render('get.png', '/assets/icons');
    expect(imgSrc(png)).toBe('/assets/icons/get.png');
    expect(tile(png)).toBeNull();

    const webp = await render('post.webp', '/assets/icons');
    expect(imgSrc(webp)).toBe('/assets/icons/post.webp');
    expect(tile(webp)).toBeNull();
  });

  it('binds the image for absolute and inline png icons', async () => {
    const absolute = await render('https://cdn.example.com/a.png', '/assets/icons');
    expect(imgSrc(absolute)).toBe('https://cdn.example.com/a.png');

    const inline = await render('data:image/png;base64,AAA');
    expect(imgSrc(inline)).toBe('data:image/png;base64,AAA');
  });

  it('ignores a query string when deciding the format', async () => {
    const fixture = await render('get.png?v=2', '/assets/icons');
    expect(imgSrc(fixture)).toBe('/assets/icons/get.png?v=2');
    expect(tile(fixture)).toBeNull();
  });

  it('shows the initials tile for an svg icon, never binding it to src', async () => {
    const fixture = await render('shapes.svg', '/assets/icons');
    expect(imgSrc(fixture)).toBeNull();
    expect(tile(fixture)).toBe('Ge');
  });

  it('shows the initials tile for a jpg icon', async () => {
    const fixture = await render('photo.jpg', '/assets/icons');
    expect(imgSrc(fixture)).toBeNull();
    expect(tile(fixture)).toBe('Ge');
  });

  it('shows the initials tile for an inline svg data URI', async () => {
    const fixture = await render('data:image/svg+xml;base64,DDD');
    expect(imgSrc(fixture)).toBeNull();
    expect(tile(fixture)).toBe('Ge');
  });

  it('shows the initials tile when the icon is absent', async () => {
    const fixture = await render(undefined, '/assets/icons');
    expect(imgSrc(fixture)).toBeNull();
    expect(tile(fixture)).toBe('Ge');
  });
});
