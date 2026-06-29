import { ErrorHandler, Injectable, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  // Injector चा वापर करून HttpClient रनटाईममध्ये मिळवणे (Circular dependency टाळण्यासाठी)
  constructor(private injector: Injector) {}

  handleError(error: any): void {
    const http = this.injector.get(HttpClient);
    const apiUrl = 'http://localhost:3000/api/logs/frontend-error';

    // एररचे तपशील गोळा करणे
    const errorLog = {
      message: error.message ? error.message : error.toString(),
      stack: error.stack ? error.stack : 'No stack trace available',
      url: window.location.href
    };

    // १. कन्सोलवर एरर दाखवणे (डेव्हलपमेंटसाठी)
    console.error('Captured Frontend Error:', error);

    // २. प्रॉडक्शमध्ये बॅकएंड सर्व्हरकडे लॉग पाठवणे
    http.post(apiUrl, errorLog).subscribe({
      next: () => {},
      error: (err) => console.error('Failed to send log to server:', err)
    });
  }
}