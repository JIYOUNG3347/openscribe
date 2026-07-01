import { ArrowRight, Mic, FileText, Sparkles } from 'lucide-react';
import { Button } from './ds';
import Logo from './Logo';

interface LandingPageProps {
  onStart: () => void;
}

export function LandingPage({ onStart }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-canvas relative overflow-hidden">
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-14px); }
        }
      `}</style>
      {/* Single very subtle static accent radial */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full opacity-[0.05]"
        style={{
          background:
            'radial-gradient(circle, var(--color-accent) 0%, transparent 70%)',
        }}
      />

      {/* Hero Section */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-20 text-center">
          {/* Logo */}
          <div className="flex justify-center mb-10">
            <div
              className="relative text-accent"
              style={{ animation: 'float 3s ease-in-out infinite' }}
            >
              <Logo title="OpenScribe" className="relative w-56 h-56" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-5xl font-semibold text-ink mb-6">
            OpenScribe
          </h1>
          <p className="text-xl text-ink-soft mb-4 max-w-2xl mx-auto">
            AI 기반 음성 회의록 자동 생성
          </p>
          <p className="text-base text-ink-faint mb-12 max-w-xl mx-auto">
            여러 STT·LLM 엔진을 한 곳에서 — 오픈소스 회의록 도구
          </p>

          {/* CTA Button — single accent fill */}
          <Button variant="primary" size="lg" onClick={onStart} className="gap-3">
            시작하기
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Features */}
        <div className="py-20 border-t border-line">
          <h2 className="text-3xl font-semibold text-center text-ink mb-16">
            주요 기능
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="text-center">
              <div className="w-16 h-16 bg-accent-subtle rounded-card flex items-center justify-center mx-auto mb-6">
                <Mic className="w-8 h-8 text-accent" />
              </div>
              <h3 className="text-xl font-semibold text-ink mb-3">
                다양한 STT 엔진 지원
              </h3>
              <p className="text-ink-soft">
                Whisper, CLOVA, Riva 등 다양한 음성 인식 엔진을 선택하여 사용할 수 있습니다
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-accent-subtle rounded-card flex items-center justify-center mx-auto mb-6">
                <Sparkles className="w-8 h-8 text-accent" />
              </div>
              <h3 className="text-xl font-semibold text-ink mb-3">
                AI 기반 자동 요약
              </h3>
              <p className="text-ink-soft">
                LLM이 회의 내용을 분석하여 핵심 요약, 결정 사항, 액션 아이템을 자동으로 정리합니다
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-accent-subtle rounded-card flex items-center justify-center mx-auto mb-6">
                <FileText className="w-8 h-8 text-accent" />
              </div>
              <h3 className="text-xl font-semibold text-ink mb-3">
                커스텀 템플릿
              </h3>
              <p className="text-ink-soft">
                팀의 필요에 맞는 회의록 템플릿을 직접 만들고 관리할 수 있습니다
              </p>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="py-20 border-t border-line">
          <h2 className="text-3xl font-semibold text-center text-ink mb-16">
            사용 방법
          </h2>

          <div className="max-w-4xl mx-auto">
            <div className="space-y-8">
              <div className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-12 h-12 bg-accent-subtle text-accent rounded-full flex items-center justify-center font-semibold text-lg font-mono tabular">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-ink mb-2">
                    음성 파일 업로드
                  </h3>
                  <p className="text-ink-soft">
                    회의 녹음 파일을 업로드하고 STT 엔진과 옵션을 선택합니다
                  </p>
                </div>
              </div>

              <div className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-12 h-12 bg-accent-subtle text-accent rounded-full flex items-center justify-center font-semibold text-lg font-mono tabular">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-ink mb-2">
                    AI 자동 변환
                  </h3>
                  <p className="text-ink-soft">
                    음성을 텍스트로 변환하고, 화자를 구분하며, LLM이 회의록을 작성합니다
                  </p>
                </div>
              </div>

              <div className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-12 h-12 bg-accent-subtle text-accent rounded-full flex items-center justify-center font-semibold text-lg font-mono tabular">
                  3
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-ink mb-2">
                    확인 및 편집
                  </h3>
                  <p className="text-ink-soft">
                    생성된 회의록을 확인하고 필요한 부분을 수정한 후 저장하거나 다운로드합니다
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="py-8 border-t border-line text-center text-sm text-ink-faint">
          <p>OpenScribe · MIT License · Open source</p>
        </div>
      </div>
    </div>
  );
}
