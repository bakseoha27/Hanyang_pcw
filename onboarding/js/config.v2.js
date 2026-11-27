/* 연결 정보 — anon(공개) 키만 사용합니다. 서비스롤 키는 절대 넣지 않습니다. */
var CFG = {
  url: 'https://vmsqlnmetmxpgrjnhmml.supabase.co',
  anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtc3Fsbm1ldG14cGdyam5obW1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2MjY2MzMsImV4cCI6MjExMTIwMjYzM30.Ut8WFZ9Qmbw6Z0YIa7x8Q9NsAMVAVGFkn8-dtkrzkJA',
  bucket: 'onboarding-docs',
  table: 'onboarding_submissions',
  adminFn: '/functions/v1/onboarding-admin',
  maxFileMB: 25
};

var DOC_TYPES = [
  { key: 'idcard',  label: '신분증',     icon: '🪪', required: true },
  { key: 'edu',     label: '기초이수증', icon: '📜', required: true },
  { key: 'bank',    label: '통장사본',   icon: '🏦', required: true },
  { key: 'photo',   label: '증명사진',   icon: '🙂', required: true },
  { key: 'health',  label: '건강검진',   icon: '🏥', required: true },
  { key: 'opinion', label: '소견서',     icon: '🗒️', required: false },
  { key: 'medicine', label: '약봉투',   icon: '💊', required: false },
  { key: 'career',  label: '경력증명서', icon: '📄', required: true }
];
