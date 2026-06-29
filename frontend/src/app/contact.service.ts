import { inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../environments/environment';

export interface Contact {
  id?: number;
  name: string;
  designation: string;
  department_name: string;
  address?: string;  
  mobile_number: string;
  telephone_number?: string;
  email?: string;
  other_contact_1?: string;
  other_contact_2?: string;
  other_contact_3?: string;
  other_contact_4?: string;  
}

export interface Department {
  id?: number;
  name: string;
}

@Injectable({
  providedIn: 'root'
})
export class ContactService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  contacts = signal<Contact[]>([]);
  departments = signal<Department[]>([]);
  token = signal<string | null>(localStorage.getItem('adminToken'));
  isAdmin = signal<boolean>(!!localStorage.getItem('adminToken'));

  getHeaders() {
    return {
      headers: new HttpHeaders({
        'Authorization': `Bearer ${this.token()}`
      })
    };
  }

  getContacts(): Observable<Contact[]> {
    return this.http.get<Contact[]>(`${this.apiUrl}/contacts`);
  }

  getDepartments(): Observable<Department[]> {
    return this.http.get<Department[]>(`${this.apiUrl}/departments`);
  }

  saveDepartment(department: Department): Observable<any> {
    return this.http.post(`${this.apiUrl}/departments`, department, this.getHeaders());
  }

  login(credentials: any): Observable<{ token: string }> {
    return this.http.post<{ token: string }>(`${this.apiUrl}/login`, credentials).pipe(
      tap(res => {
        this.token.set(res.token);
        this.isAdmin.set(true);
        localStorage.setItem('adminToken', res.token);
      })
    );
  }

  logout(): void {
    this.token.set(null);
    this.isAdmin.set(false);
    localStorage.removeItem('adminToken');
  }

  bulkImportContacts(contacts: any[]): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/bulk-import`, { contacts }, this.getHeaders());
  }

  saveContact(contact: Contact): Observable<any> {
    if (contact.id) {
      return this.http.put(`${this.apiUrl}/contacts/${contact.id}`, contact, this.getHeaders());
    } else {
      return this.http.post(`${this.apiUrl}/contacts`, contact, this.getHeaders());
    }
  }

  deleteContact(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/contacts/${id}`, this.getHeaders());
  }
}