import moment from 'moment';
export function mapLink(link: any) { return { ...link, token_masuk: link.token_masuk, token_keluar: link.token_keluar, start: link.start ? moment(link.start).format('YYYY-MM-DD HH:mm:ss') : null, end: link.end ? moment(link.end).format('YYYY-MM-DD HH:mm:ss') : null }; }
